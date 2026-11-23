# T02: Simulated suppliers
**Reqs:** S1, S2, S3, S4

## Goal
Seven suppliers behind `ISupplier`, configured via the catalog from T01. Behaviour is deterministic under test.

## Design
```csharp
public record SearchCriteria(string FromLocation, string ToLocation, DateOnly FromDate, DateOnly ToDate);
public record SupplierQuote(decimal PriceUsd);

public interface ISupplier {
    string Id { get; }
    string Name { get; }
    Task<SupplierQuote> GetQuoteAsync(SearchCriteria criteria, CancellationToken ct);
}
```
- The simulated suppliers ignore `criteria`. It is there because a real supplier interface would need it (S1: "common interface").
- The supplier only returns a price. The orchestrator (T03) measures the response time and the timestamp with `TimeProvider`.
- `IRandomSource` has one method, `double NextDouble()`. Production wraps `Random.Shared`. Tests use a fake that returns a fixed sequence.
- `SimulatedSupplier(id, name, SupplierBehavior, TimeProvider, IRandomSource)`.
  It draws everything before the first `await`, in this order: delay, failure roll (flaky only), price. The price is drawn even if the
  roll says fail, so every supplier uses a fixed number of values. The hanging supplier draws nothing.
  Supplier calls start in catalog order, so the fake's sequence maps to suppliers in a known order.
- `Normal`: `Task.Delay(0.5–5 s, timeProvider, ct)`, then a price of 50.00–500.00 USD, rounded to cents.
- `Flaky`: same delay, then throws `SupplierUnavailableException` if the roll is below 0.3.
- `Hanging`: `Task.Delay(Timeout.InfiniteTimeSpan, timeProvider, ct)`. Must end **only** through `ct`.
- The catalog gets a behaviour per supplier: 5 Normal, 1 Flaky, 1 Hanging.
- DI: `TimeProvider.System`, the production `IRandomSource`, and the suppliers as `IEnumerable<ISupplier>`. Tests replace the first two.

## Acceptance criteria
- No `Thread.Sleep`. No `Task.Delay` without the `TimeProvider` and `ct` overload.
- `Random.Shared` is used only inside the production `IRandomSource`.

## Tests (component: `SimulatedSupplier` + FakeTimeProvider + fake random)
Kept small on purpose. Delays, prices and failures are exercised end to end in T05a.
- S4: the hanging supplier doesn't complete when time advances 1 h, and throws `OperationCanceledException` as soon as `ct` is cancelled.
- S3: the flaky supplier throws when the roll is below 0.3 and returns a price otherwise.
- S2: a normal supplier returns only after its delay has elapsed. With the lowest and highest random values, delay and price stay within bounds.
