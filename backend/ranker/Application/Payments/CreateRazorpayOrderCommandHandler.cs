using System.Text.Json;
using MediatR;
using Microsoft.Extensions.Logging;
using Ranker.Data;
using Ranker.Domain.Entities;
using Ranker.Dtos;
using Razorpay.Api;

namespace Ranker.Application.Payments;

public class CreateRazorpayOrderCommandHandler(
    RazorpayClient razorpayClient,
    RankerDbContext dbContext,
    ILogger<CreateRazorpayOrderCommandHandler> logger)
    : IRequestHandler<CreateRazorpayOrderCommand, CreateRazorpayOrderResponseDto>
{
    private const long MinAmountInPaise = 100;

    public async Task<CreateRazorpayOrderResponseDto> Handle(
        CreateRazorpayOrderCommand command,
        CancellationToken ct)
    {
        if (command.AmountInPaise < MinAmountInPaise)
            throw new ArgumentException(
                $"Amount must be at least {MinAmountInPaise} paise (₹1). Received: {command.AmountInPaise}");

        var orderOptions = new Dictionary<string, object>
        {
            ["amount"]   = command.AmountInPaise,
            ["currency"] = command.Currency,
            ["receipt"]  = command.Receipt ?? $"rcpt_{Guid.NewGuid():N}",
        };

        var requestJson = JsonSerializer.Serialize(orderOptions);

        logger.LogInformation(
            "Creating Razorpay order: amount={Amount} paise, currency={Currency}",
            (object)command.AmountInPaise, (object)command.Currency);

        try
        {
            var order = razorpayClient.Order.Create(orderOptions);

            // order["..."] returns dynamic — cast to concrete types before use so the
            // compiler can resolve ILogger extension methods (no dynamic dispatch allowed).
            string orderId  = order["id"].ToString()!;
            long   amount   = (long)order["amount"];
            string currency = order["currency"].ToString()!;
            string? status  = order["status"]?.ToString();

            var responseJson = JsonSerializer.Serialize(new
            {
                id = orderId,
                amount,
                currency,
                status
            });

            logger.LogInformation("Razorpay order created: {OrderId}", (object)orderId);

            var audit = new PaymentAuditLog
            {
                Action = "CreateOrder",
                Gateway = "Razorpay",
                OrderId = orderId,
                AmountInPaise = command.AmountInPaise,
                Amount = Math.Round((decimal)command.AmountInPaise / 100m, 2),
                Currency = command.Currency,
                Receipt = command.Receipt,
                RequestPayloadJson = requestJson,
                ResponsePayloadJson = responseJson,
                IsSuccess = true,
                CreatedAt = DateTime.UtcNow,
            };

            dbContext.PaymentAuditLogs.Add(audit);
            await dbContext.SaveChangesAsync(ct);

            return new CreateRazorpayOrderResponseDto(orderId, amount, currency);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed creating Razorpay order: amount={Amount} paise", (object)command.AmountInPaise);

            var failedAudit = new PaymentAuditLog
            {
                Action = "CreateOrder",
                Gateway = "Razorpay",
                AmountInPaise = command.AmountInPaise,
                Amount = Math.Round((decimal)command.AmountInPaise / 100m, 2),
                Currency = command.Currency,
                Receipt = command.Receipt,
                RequestPayloadJson = requestJson,
                IsSuccess = false,
                ErrorMessage = ex.Message,
                CreatedAt = DateTime.UtcNow,
            };

            dbContext.PaymentAuditLogs.Add(failedAudit);
            try { await dbContext.SaveChangesAsync(ct); } catch { /* Ignore secondary logging failure */ }

            throw;
        }
    }
}
