using MediatR;
using Microsoft.Extensions.Logging;
using Ranker.Dtos;
using Razorpay.Api;

namespace Ranker.Application.Payments;

public class CreateRazorpayOrderCommandHandler(
    RazorpayClient razorpayClient,
    ILogger<CreateRazorpayOrderCommandHandler> logger)
    : IRequestHandler<CreateRazorpayOrderCommand, CreateRazorpayOrderResponseDto>
{
    private const long MinAmountInPaise = 100;

    public Task<CreateRazorpayOrderResponseDto> Handle(
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

        logger.LogInformation(
            "Creating Razorpay order: amount={Amount} paise, currency={Currency}",
            (object)command.AmountInPaise, (object)command.Currency);

        var order = razorpayClient.Order.Create(orderOptions);

        // order["..."] returns dynamic — cast to concrete types before use so the
        // compiler can resolve ILogger extension methods (no dynamic dispatch allowed).
        string orderId  = order["id"].ToString()!;
        long   amount   = (long)order["amount"];
        string currency = order["currency"].ToString()!;

        logger.LogInformation("Razorpay order created: {OrderId}", (object)orderId);

        return Task.FromResult(new CreateRazorpayOrderResponseDto(orderId, amount, currency));
    }
}
