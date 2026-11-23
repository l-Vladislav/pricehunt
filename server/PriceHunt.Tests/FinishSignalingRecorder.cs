using PriceHunt.Api.Search;

namespace PriceHunt.Tests;

/// <summary>Completes <see cref="Finished"/> only after the inner <c>FinishAsync</c> has returned, so the status is in the DB.</summary>
public sealed class FinishSignalingRecorder(ISearchRecorder inner) : ISearchRecorder
{
    private readonly TaskCompletionSource _finished = new(TaskCreationOptions.RunContinuationsAsynchronously);

    public Task Finished => _finished.Task;

    public Task StartAsync(SearchRequest request, IReadOnlyList<string> supplierIds, DateTime createdAtUtc, CancellationToken ct) =>
        inner.StartAsync(request, supplierIds, createdAtUtc, ct);

    public Task RecordAsync(Guid searchId, SupplierResult result, CancellationToken ct) =>
        inner.RecordAsync(searchId, result, ct);

    public async Task FinishAsync(Guid searchId, SearchStatus status, CancellationToken ct)
    {
        try
        {
            await inner.FinishAsync(searchId, status, ct);
            _finished.TrySetResult();
        }
        catch (Exception e)
        {
            _finished.TrySetException(e);
            throw;
        }
    }
}
