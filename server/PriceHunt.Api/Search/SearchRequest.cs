namespace PriceHunt.Api.Search;

// The dates and the supplier list are nullable so the endpoint's validation (T05b) can require the dates.
// Null or empty SupplierIds means all suppliers.
public record SearchRequest(
    Guid SearchId,
    string FromLocation,
    string ToLocation,
    DateOnly? FromDate,
    DateOnly? ToDate,
    IReadOnlyList<string>? SupplierIds);
