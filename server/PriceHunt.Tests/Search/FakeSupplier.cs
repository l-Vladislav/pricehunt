using PriceHunt.Api.Suppliers;

namespace PriceHunt.Tests.Search;

/// <summary>
/// A supplier that answers when the test says so. By default its call ends cancelled when the token fires.
/// With <c>ignoresCancellation</c> it only notes that the token fired and waits for the test to answer.
/// </summary>
public sealed class FakeSupplier(string id, CallLog log, bool ignoresCancellation = false) : ISupplier
{
    // Default options, no RunContinuationsAsynchronously: the orchestrator sees the answer before TrySetResult returns.
    private readonly TaskCompletionSource<SupplierQuote> _answer = new();
    private volatile bool _wasCancelled;

    public string Id => id;
    public string Name => $"Supplier {id}";
    public bool WasCancelled => _wasCancelled;

    public Task<SupplierQuote> GetQuoteAsync(SearchCriteria criteria, CancellationToken ct)
    {
        log.Add($"call:{id}");
        ct.Register(() =>
        {
            _wasCancelled = true;
            if (!ignoresCancellation)
                _answer.TrySetCanceled(ct);
        });
        return _answer.Task;
    }

    public void Answer(decimal price) => _answer.TrySetResult(new SupplierQuote(price));

    public void Fail(Exception exception) => _answer.TrySetException(exception);
}
