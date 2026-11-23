using Microsoft.EntityFrameworkCore;
using PriceHunt.Api.Search;

namespace PriceHunt.Api.Data;

public sealed class EfSearchRecorder(IDbContextFactory<AppDbContext> dbFactory) : ISearchRecorder
{
    // SQLite has one writer. Without this gate, concurrent searches wait on the locked file and miss the deadline.
    // No test can catch its removal: the in-memory test database has no file lock.
    private readonly SemaphoreSlim _writeGate = new(1, 1);

    public Task StartAsync(SearchRequest request, IReadOnlyList<string> supplierIds, DateTime createdAtUtc, CancellationToken ct) =>
        WriteAsync(async (db, ct) =>
        {
            db.Searches.Add(new SearchRecord
            {
                Id = request.SearchId,
                FromLocation = request.FromLocation,
                ToLocation = request.ToLocation,
                FromDate = request.FromDate ?? throw new ArgumentException("FromDate is required.", nameof(request)),
                ToDate = request.ToDate ?? throw new ArgumentException("ToDate is required.", nameof(request)),
                CreatedAtUtc = createdAtUtc,
                Status = SearchStatus.Running,
            });
            db.SearchSuppliers.AddRange(supplierIds.Select(id => new SearchSupplier { SearchId = request.SearchId, SupplierId = id }));
            await db.SaveChangesAsync(ct);
        }, ct);

    public Task RecordAsync(Guid searchId, SupplierResult result, CancellationToken ct) =>
        WriteAsync(async (db, ct) =>
        {
            db.SupplierResponses.Add(new SupplierResponse
            {
                SearchId = searchId,
                SupplierId = result.SupplierId,
                PriceMinor = result.Price is { } price ? (long)(price * 100) : null, // prices have two decimals
                ResponseTimeMs = result.ResponseTimeMs,
                ReceivedAtUtc = result.ReceivedAtUtc,
            });
            await db.SaveChangesAsync(ct);
        }, ct);

    public Task FinishAsync(Guid searchId, SearchStatus status, CancellationToken ct) =>
        WriteAsync(
            (db, ct) => db.Searches.Where(s => s.Id == searchId).ExecuteUpdateAsync(u => u.SetProperty(s => s.Status, status), ct),
            ct);

    private async Task WriteAsync(Func<AppDbContext, CancellationToken, Task> write, CancellationToken ct)
    {
        await _writeGate.WaitAsync(ct);
        try
        {
            await using var db = await dbFactory.CreateDbContextAsync(ct);
            await write(db, ct);
        }
        finally
        {
            _writeGate.Release();
        }
    }
}
