using System.Runtime.CompilerServices;
using PriceHunt.Api.Suppliers;

namespace PriceHunt.Api.Search;

/// <summary>
/// Runs one search: queries the selected suppliers at once and yields each result as it arrives, for at most 6 s.
/// See plan.md, "Concurrency model".
/// </summary>
public sealed class SearchOrchestrator(IEnumerable<ISupplier> suppliers, ISearchRecorder recorder, TimeProvider timeProvider)
{
    private static readonly TimeSpan Deadline = TimeSpan.FromSeconds(6);

    private readonly IReadOnlyList<ISupplier> _suppliers = [.. suppliers];

    public async IAsyncEnumerable<SearchEvent> RunAsync(
        SearchRequest request, [EnumeratorCancellation] CancellationToken ct = default)
    {
        var selected = Select(request.SupplierIds);
        var criteria = new SearchCriteria(
            request.FromLocation,
            request.ToLocation,
            request.FromDate ?? throw new ArgumentException("FromDate is required.", nameof(request)),
            request.ToDate ?? throw new ArgumentException("ToDate is required.", nameof(request)));

        // The timer belongs to its own CTS: CancelAfter on a linked CTS would use the system clock, not timeProvider.
        // It starts before the start write, so a slow write counts toward the 6 s.
        using var timeoutCts = new CancellationTokenSource(Deadline, timeProvider);
        using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(ct, timeoutCts.Token);

        await recorder.StartAsync(
            request, [.. selected.Select(s => s.Id)], timeProvider.GetUtcNow().UtcDateTime, CancellationToken.None);

        var startedAt = timeProvider.GetTimestamp();
        var tasks = selected.Select(s => QueryAsync(s, criteria, startedAt, linkedCts.Token)).ToList();
        var statusWritten = false;
        try
        {
            yield return new SearchStarted(request.SearchId, [.. selected.Select(s => new SupplierInfo(s.Id, s.Name))]);

            var status = SearchStatus.Completed;
            var responded = 0;
            await using var results = Task.WhenEach(tasks).GetAsyncEnumerator(linkedCts.Token);
            while (true)
            {
                // C# allows no yield inside a try with a catch, so only MoveNextAsync is wrapped.
                // It throws once the token fired while a task is not taken yet, and returns false after the last task.
                try
                {
                    if (!await results.MoveNextAsync())
                        break;
                }
                catch (OperationCanceledException) when (timeoutCts.IsCancellationRequested && !ct.IsCancellationRequested)
                {
                    status = SearchStatus.TimedOut;
                    break;
                }

                var result = await results.Current;
                await recorder.RecordAsync(request.SearchId, result, CancellationToken.None);
                if (result.Price is { } price)
                {
                    responded++; // I1: only a price counts
                    yield return new QuoteReceived(request.SearchId, result.SupplierId, price, result.ResponseTimeMs);
                }
                else
                {
                    yield return new SupplierFailed(request.SearchId, result.SupplierId, result.ResponseTimeMs);
                }
            }

            // The loop ends without looking at the token after the last task, so a caller that left during the
            // last write is caught here. The caller's token, not the linked one: a timeout there still means Completed.
            ct.ThrowIfCancellationRequested();

            await recorder.FinishAsync(request.SearchId, status, CancellationToken.None);
            statusWritten = true;
            yield return new SearchEnded(request.SearchId, status, responded, selected.Count);
        }
        finally
        {
            // Cancel() runs the suppliers' cancellation callbacks before it returns, so the hanging one ends here.
            linkedCts.Cancel();
            await ((Task)Task.WhenAll(tasks)).ConfigureAwait(ConfigureAwaitOptions.SuppressThrowing);

            // The caller cancelled, or the consumer stopped enumerating early (I7).
            if (!statusWritten)
                await recorder.FinishAsync(request.SearchId, SearchStatus.Cancelled, CancellationToken.None);
        }
    }

    // Filters the registered suppliers rather than mapping the ids, so the selection keeps catalog order
    // and a repeated id counts once.
    private IReadOnlyList<ISupplier> Select(IReadOnlyList<string>? supplierIds) =>
        supplierIds is null or [] ? _suppliers : [.. _suppliers.Where(s => supplierIds.Contains(s.Id))];

    private async Task<SupplierResult> QueryAsync(
        ISupplier supplier, SearchCriteria criteria, long startedAt, CancellationToken linkedToken)
    {
        decimal? price;
        try
        {
            price = (await supplier.GetQuoteAsync(criteria, linkedToken)).PriceUsd;
        }
        catch (Exception e) when (e is not OperationCanceledException || !linkedToken.IsCancellationRequested)
        {
            price = null; // SS4: any failure of one supplier becomes its result and doesn't affect the others
        }

        // Stamped here, when the supplier answers: the loop may take this result later, after an earlier write (P2).
        return new SupplierResult(
            supplier.Id,
            price,
            (long)timeProvider.GetElapsedTime(startedAt).TotalMilliseconds,
            timeProvider.GetUtcNow().UtcDateTime);
    }
}
