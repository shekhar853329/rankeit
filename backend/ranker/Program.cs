using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.EntityFrameworkCore;
using Ranker.Application.Bids;
using Ranker.Data;
using Ranker.Hubs;
using Ranker.Repositories;
using Ranker.Services.Leaderboards;
using Ranker.Services.Payments;
using Ranker.Services.UrlMetadata;

var builder = WebApplication.CreateBuilder(args);

const string AngularDevCorsPolicy = "AngularDev";

// Add services to the container.
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();
builder.Services.AddControllers();
builder.Services.AddMemoryCache();
builder.Services.AddSignalR();

builder.Services.AddDbContext<RankerDbContext>(options =>
    options.UseNpgsql(
        builder.Configuration.GetConnectionString("RankerDb"),
        npgsqlOptions => npgsqlOptions.EnableRetryOnFailure(
            maxRetryCount: 5,
            maxRetryDelay: TimeSpan.FromSeconds(10),
            errorCodesToAdd: null
        )
    ));

builder.Services.AddMediatR(cfg => cfg.RegisterServicesFromAssemblyContaining<PlaceBidCommand>());

builder.Services.AddScoped<ICategoryRepository, CategoryRepository>();
builder.Services.AddScoped<IListingRepository, ListingRepository>();
builder.Services.AddScoped<IBidRepository, BidRepository>();
builder.Services.AddSingleton<GlobalLeaderboardCache>();
builder.Services.AddSingleton<OnlineUsersTracker>();

// ── URL Metadata ──────────────────────────────────────────────────────────
// Direct HTTP scrape with enhanced browser mimicry to avoid bot detection
builder.Services.AddHttpClient("UrlMetadataDirect", client =>
{
    client.Timeout = TimeSpan.FromSeconds(15);
    
    // Modern Chrome user agent
    client.DefaultRequestHeaders.UserAgent.ParseAdd(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36");
    
    // Accept headers to look like a real browser
    client.DefaultRequestHeaders.Accept.ParseAdd(
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7");
    client.DefaultRequestHeaders.AcceptLanguage.ParseAdd("en-US,en;q=0.9");
    client.DefaultRequestHeaders.AcceptEncoding.ParseAdd("gzip, deflate, br");
})
.ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler
{
    AutomaticDecompression = System.Net.DecompressionMethods.All,
    AllowAutoRedirect = true,
    MaxAutomaticRedirections = 5,
    // Some sites check for cookie support
    UseCookies = true
});

builder.Services.AddScoped<IUrlMetadataService, UrlMetadataService>();

// ── Razorpay ──────────────────────────────────────────────────────────────
builder.Services.Configure<RazorpayOptions>(
    builder.Configuration.GetSection(RazorpayOptions.SectionName));

builder.Services.AddSingleton<Razorpay.Api.RazorpayClient>(sp =>
{
    var opts = sp.GetRequiredService<Microsoft.Extensions.Options.IOptions<RazorpayOptions>>().Value;
    return new Razorpay.Api.RazorpayClient(opts.KeyId, opts.KeySecret);
});

// Configure forwarded headers for running behind reverse proxy (Nginx on Ubuntu)
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    options.KnownIPNetworks.Clear();
    options.KnownProxies.Clear();
});

builder.Services.AddCors(options => options.AddPolicy(AngularDevCorsPolicy, policy =>
{
    var configuredOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>();
    if (configuredOrigins != null && configuredOrigins.Length > 0)
    {
        policy.WithOrigins(configuredOrigins)
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    }
    else
    {
        // Fallback: dynamic origin allowing for local dev, IP-based access, and reverse-proxied domains
        policy.SetIsOriginAllowed(_ => true)
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    }
}));

var app = builder.Build();

app.UseForwardedHeaders();

using (var scope = app.Services.CreateScope())
{
    var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
    var rawConnStr = builder.Configuration.GetConnectionString("RankerDb");

    if (string.IsNullOrWhiteSpace(rawConnStr))
    {
        logger.LogWarning("No connection string configured for 'RankerDb'. Database migration skipped. Server running in Degraded mode.");
    }
    else
    {
        try
        {
            var csb = new Npgsql.NpgsqlConnectionStringBuilder(rawConnStr);
            logger.LogInformation("Database configured: Host='{Host}', Database='{Database}', User='{Username}'",
                csb.Host,
                csb.Database,
                csb.Username);
        }
        catch
        {
            logger.LogWarning("ConnectionString 'RankerDb' is present but could not be parsed by SqlConnectionStringBuilder.");
        }

        try
        {
            logger.LogInformation("Checking database connectivity and applying migrations...");
            var dbContext = scope.ServiceProvider.GetRequiredService<RankerDbContext>();
            await dbContext.Database.MigrateAsync();
            if (app.Environment.IsDevelopment())
            {
                await DbSeeder.SeedAsync(dbContext);
                logger.LogInformation("Database seeding completed successfully.");
            }
            logger.LogInformation("Database migration completed successfully.");
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Database migration failed on startup. Server will continue running in Degraded mode so health check and diagnostics are available.");
        }
    }
}

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

var enableHttpsRedirection = builder.Configuration.GetValue<bool>("EnableHttpsRedirection", false);
if (enableHttpsRedirection && !app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}

// Restrict direct external API consumption in Production:
// Requests must carry the X-App-Client verification header from the Angular app,
// or be an internal health check / loopback SSR request.
app.Use(async (context, next) =>
{
    var path = context.Request.Path;

    if (!app.Environment.IsDevelopment() &&
        path.StartsWithSegments("/api") &&
        !path.StartsWithSegments("/api/health"))
    {
        // 1. Allow if Angular application verification header is present
        if (context.Request.Headers.TryGetValue("X-App-Client", out var clientHeader) &&
            clientHeader == "Ranker-UI-Client")
        {
            await next();
            return;
        }

        // 2. Allow internal loopback calls without header (e.g. Node SSR making direct loopback calls)
        var remoteIp = context.Connection.RemoteIpAddress;
        if (remoteIp != null && System.Net.IPAddress.IsLoopback(remoteIp) &&
            !context.Request.Headers.ContainsKey("X-Forwarded-For"))
        {
            await next();
            return;
        }

        // 3. Reject unauthorized external calls
        context.Response.StatusCode = StatusCodes.Status403Forbidden;
        context.Response.ContentType = "application/json";
        await context.Response.WriteAsync("{\"error\":\"Forbidden\",\"message\":\"Direct API access is restricted.\"}");
        return;
    }

    await next();
});

app.UseCors(AngularDevCorsPolicy);

app.MapControllers();
app.MapHub<LeaderboardHub>("/hubs/leaderboard");

app.Run();
