using System.Diagnostics;

namespace PriceHunt.Api.Suppliers;

public sealed class SimulatedSupplier(
    string id, string name, SupplierBehavior behavior, TimeProvider timeProvider, IRandomSource random) : ISupplier
{
    private static readonly TimeSpan MinDelay = TimeSpan.FromMilliseconds(500);
    private static readonly TimeSpan MaxDelay = TimeSpan.FromSeconds(5);
    private const decimal MinPrice = 50m;
    private const decimal MaxPrice = 500m;
    private const double FailureRate = 0.3;

    public string Id => id;
    public string Name => name;
    public SupplierBehavior Behavior => behavior;

    public async Task<SupplierQuote> GetQuoteAsync(SearchCriteria criteria, CancellationToken ct)
    {
        if (behavior == SupplierBehavior.Hanging)
        {
            await Task.Delay(Timeout.InfiniteTimeSpan, timeProvider, ct);
            throw new UnreachableException();
        }

        // All draws happen before the first await, so calls started in catalog order take values in that order.
        // The price is drawn even when the call will fail, so every call takes the same number of values.
        var delay = MinDelay + (MaxDelay - MinDelay) * random.NextDouble();
        var fails = behavior == SupplierBehavior.Flaky && random.NextDouble() < FailureRate;
        var price = decimal.Round(MinPrice + (MaxPrice - MinPrice) * (decimal)random.NextDouble(), 2);

        await Task.Delay(delay, timeProvider, ct);

        if (fails)
            throw new SupplierUnavailableException(id);

        return new SupplierQuote(price);
    }
}
