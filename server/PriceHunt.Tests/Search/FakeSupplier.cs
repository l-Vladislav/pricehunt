using PriceHunt.Api.Suppliers;

namespace PriceHunt.Tests.Search;

/// <summary>A supplier that answers when the test says so. Its call ends cancelled when the token fires.</summary>
public sealed class FakeSupplier(string id, CallLog log) : ISupplier
{
    // Default options, no RunContinuationsAsynchronously: the orchestrator sees the answer before TrySetResult returns.
    private readonly TaskCompletionSource<SupplierQuote> _answer = new();

    public string Id => id;
    public string Name => $"Supplier {id}";
    public bool WasCancelled => _answer.Task.IsCanceled;

    public Task<SupplierQuote> GetQuoteAsync(SearchCriteria criteria, CancellationToken ct)
    {
        log.Add($"call:{id}");
        ct.Register(() => _answer.TrySetCanceled(ct));
        return _answer.Task;
    }

    public void Answer(decimal price) => _answer.TrySetResult(new SupplierQuote(price));

    public void Fail(Exception exception) => _answer.TrySetException(exception);
}
