using MediatR;
using Microsoft.AspNetCore.Mvc;
using Ranker.Application.Payments;
using Ranker.Dtos;

namespace Ranker.Controllers;

[ApiController]
[Route("api/payments")]
public class PaymentsController(ISender sender) : ControllerBase
{
    /// <summary>
    /// Creates a Razorpay order. The frontend uses the returned order_id to open the checkout modal.
    /// Amount must be in paise (INR × 100), minimum 100.
    /// </summary>
    [HttpPost("create-order")]
    public async Task<ActionResult<CreateRazorpayOrderResponseDto>> CreateOrder(
        [FromBody] CreateRazorpayOrderRequestDto request,
        CancellationToken ct)
    {
        if (request.AmountInPaise < 100)
            return BadRequest(new { error = "Amount must be at least 100 paise (₹1)." });

        try
        {
            var result = await sender.Send(
                new CreateRazorpayOrderCommand(request.AmountInPaise, request.Currency, request.Receipt), ct);
            return Ok(result);
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = "Failed to create Razorpay order.", detail = ex.Message });
        }
    }

    /// <summary>
    /// Verifies the Razorpay payment signature (HMAC-SHA256).
    /// Returns 400 on mismatch — do NOT mark a bid as paid on a 400.
    /// </summary>
    [HttpPost("verify-payment")]
    public async Task<ActionResult<VerifyRazorpayPaymentResponseDto>> VerifyPayment(
        [FromBody] VerifyRazorpayPaymentRequestDto request,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.RazorpayOrderId)
            || string.IsNullOrWhiteSpace(request.RazorpayPaymentId)
            || string.IsNullOrWhiteSpace(request.RazorpaySignature))
        {
            return BadRequest(new { error = "RazorpayOrderId, RazorpayPaymentId, and RazorpaySignature are all required." });
        }

        var result = await sender.Send(
            new VerifyRazorpayPaymentCommand(
                request.RazorpayOrderId,
                request.RazorpayPaymentId,
                request.RazorpaySignature), ct);

        return result.Verified ? Ok(result) : BadRequest(result);
    }
}
