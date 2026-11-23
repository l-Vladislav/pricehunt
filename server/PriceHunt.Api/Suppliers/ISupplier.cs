namespace PriceHunt.Api.Suppliers;

public interface ISupplier
{
    string Id { get; }
    string Name { get; }
    Task<SupplierQuote> GetQuoteAsync(SearchCriteria criteria, CancellationToken ct);
}
