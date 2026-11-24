namespace PriceHunt.Api.Data;

public class SupplierResponse
{
    public long Id { get; set; }
    public Guid SearchId { get; set; }
    public required string SupplierId { get; set; }

    /// <summary>USD cents. Null means the supplier failed (P2).</summary>
    public long? PriceMinor { get; set; }

    public long ResponseTimeMs { get; set; }
    public DateTime ReceivedAtUtc { get; set; }
}
