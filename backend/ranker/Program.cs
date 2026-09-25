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
    options.UseSqlServer(builder.Configuration.GetConnectionString("RankerDb")));

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

builder.Services.AddCors(options => options.AddPolicy(AngularDevCorsPolicy, policy =>
    policy.WithOrigins("http://localhost:4200")
        .AllowAnyHeader()
        .AllowAnyMethod()
        .AllowCredentials()));

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var dbContext = scope.ServiceProvider.GetRequiredService<RankerDbContext>();
    await dbContext.Database.MigrateAsync();
    await DbSeeder.SeedAsync(dbContext);
}

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

if (!app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}

app.UseCors(AngularDevCorsPolicy);

app.MapControllers();
app.MapHub<LeaderboardHub>("/hubs/leaderboard");

app.Run();
