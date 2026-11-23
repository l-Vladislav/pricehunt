using PriceHunt.Api.Search;

namespace PriceHunt.Tests.Search;

/// <summary>
/// Records the calls in memory. Like EF, every method throws if its token is cancelled: on entry, and again after
/// the test's hook ran (the hook may advance time or cancel a token). A call is logged once it has completed.
/// </summary>
public sealed class FakeSearchRecorder(CallLog log) : ISearchRecorder
{
    public Action? OnStart { get; set; }
    public Func<SupplierResult, Task>? OnRecord { get; set; }

    public IReadOnlyList<string>? StartedSupplierIds { get; private set; }
    public DateTime? CreatedAtUtc { get; private set; }
    public List<SupplierResult> Results { get; } = [];
    public List<SearchStatus> Statuses { get; } = [];

    public Task StartAsync(SearchRequest request, IReadOnlyList<string> supplierIds, DateTime createdAtUtc, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        OnStart?.Invoke();
        ct.ThrowIfCancellationRequested();
        StartedSupplierIds = supplierIds;
        CreatedAtUtc = createdAtUtc;
        log.Add("start");
        return Task.CompletedTask;
    }

    public async Task RecordAsync(Guid searchId, SupplierResult result, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        if (OnRecord is not null)
            await OnRecord(result);
        ct.ThrowIfCancellationRequested();
        Results.Add(result);
        log.Add($"record:{result.SupplierId}");
    }

    public Task FinishAsync(Guid searchId, SearchStatus status, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        Statuses.Add(status);
        log.Add($"finish:{status}");
        return Task.CompletedTask;
    }
}
