using Ranker.Application.Common;
using Xunit;

namespace Ranker.Tests.Application.Common;

public class PaymentIdMaskerTests
{
    [Fact]
    public void Mask_Null_ReturnsNull()
    {
        Assert.Null(PaymentIdMasker.Mask(null));
    }

    [Fact]
    public void Mask_EmptyString_ReturnsEmpty()
    {
        Assert.Equal(string.Empty, PaymentIdMasker.Mask(string.Empty));
    }

    [Fact]
    public void Mask_ShortString_ReturnsAllAsterisks()
    {
        // Length < 6 → "******"
        Assert.Equal("******", PaymentIdMasker.Mask("abc"));
    }

    [Fact]
    public void Mask_ExactlySixChars_ReturnsAllAsterisks()
    {
        // Length == 6 → "******"
        Assert.Equal("******", PaymentIdMasker.Mask("abcdef"));
    }

    [Fact]
    public void Mask_SevenChars_ReturnsPrefixPlusLastSix()
    {
        // Length == 7: last 6 of "xabcdef" = "abcdef" → "****abcdef"
        Assert.Equal("****abcdef", PaymentIdMasker.Mask("xabcdef"));
    }

    [Fact]
    public void Mask_TypicalDodoPaymentId_ReturnsPrefixPlusLastSix()
    {
        // "pay_0001a2b3c4d5" — last 6 chars are "3c4d5" wait…
        // "pay_0001a2b3c4d5" has 16 chars; last 6 = "b3c4d5"
        var input = "pay_0001a2b3c4d5";
        var expected = "****b3c4d5";
        Assert.Equal(expected, PaymentIdMasker.Mask(input));
    }

    [Fact]
    public void Mask_PrefixIsAlwaysFourAsterisks_RegardlessOfHiddenLength()
    {
        // A very long ID still gets exactly "****" + last 6 chars
        var input = "very_long_payment_reference_id_12345";
        var result = PaymentIdMasker.Mask(input);
        Assert.StartsWith("****", result!);
        Assert.Equal("****" + input[^6..], result);
    }
}
