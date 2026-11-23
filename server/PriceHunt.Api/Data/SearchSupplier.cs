namespace PriceHunt.Api.Data;

/// <summary>A supplier selected for a search (P1).</summary>
public class SearchSupplier
{
    public Guid SearchId { get; set; }
    public required string SupplierId { get; set; }
}
