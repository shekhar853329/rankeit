namespace Ranker.Application.Common;

/// <summary>
/// Utility for masking payment identifiers before they are sent to the client.
/// </summary>
public static class PaymentIdMasker
{
    /// <summary>
    /// Returns a masked representation of a payment ID or reference.
    /// Keeps the last 6 characters visible and prefixes with "****".
    ///
    /// Rules:
    ///   - null or empty string → returned as-is.
    ///   - Length ≤ 6 → replaced entirely with "******".
    ///   - Length &gt; 6 → "****" + last-6-chars.
    /// </summary>
    /// <example>
    /// <code>
    /// Mask(null)              // null
    /// Mask("")                // ""
    /// Mask("abc")             // "******"
    /// Mask("pay_0001a2b3c4")  // "****2b3c4" — last 6 chars shown, prefixed with ****
    /// </code>
    /// </example>
    public static string? Mask(string? value)
    {
        if (string.IsNullOrEmpty(value))
            return value;

        if (value.Length <= 6)
            return "******";

        return "****" + value[^6..];
    }
}
