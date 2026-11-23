namespace PriceHunt.Api.Suppliers;

public sealed class SimulatedSupplier(
    string id, string name, SupplierBehavior behavior, TimeProvider timeProvider, IRandomSource random) : ISupplier
{
    public string Id => id;
    public string Name => name;
    public SupplierBehavior Behavior => behavior;

    public Task<SupplierQuote> GetQuoteAsync(SearchCriteria criteria, CancellationToken ct) =>
        throw new NotImplementedException();
}
