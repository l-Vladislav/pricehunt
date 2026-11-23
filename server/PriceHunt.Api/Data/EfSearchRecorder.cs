using PriceHunt.Api.Search;

namespace PriceHunt.Api.Data;

public sealed class EfSearchRecorder : ISearchRecorder
{
    public Task StartAsync(SearchRequest request, IReadOnlyList<string> supplierIds, DateTime createdAtUtc, CancellationToken ct) =>
        throw new NotImplementedException();

    public Task RecordAsync(Guid searchId, SupplierResult result, CancellationToken ct) =>
        throw new NotImplementedException();

    public Task FinishAsync(Guid searchId, SearchStatus status, CancellationToken ct) =>
        throw new NotImplementedException();
}
