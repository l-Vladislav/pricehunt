namespace PriceHunt.Api.Search;

public interface ISearchRecorder
{
    Task StartAsync(SearchRequest request, IReadOnlyList<string> supplierIds, DateTime createdAtUtc, CancellationToken ct);
    Task RecordAsync(Guid searchId, SupplierResult result, CancellationToken ct);
    Task FinishAsync(Guid searchId, SearchStatus status, CancellationToken ct);
}
