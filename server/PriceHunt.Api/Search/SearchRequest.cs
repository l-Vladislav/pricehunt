namespace PriceHunt.Api.Search;

// The dates are nullable so the endpoint's validation can reject a missing date.
// Null or empty SupplierIds means all suppliers.
public record SearchRequest(
    Guid SearchId,
    string FromLocation,
    string ToLocation,
    DateOnly? FromDate,
    DateOnly? ToDate,
    IReadOnlyList<string>? SupplierIds);
