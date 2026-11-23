using Microsoft.Extensions.Time.Testing;
using PriceHunt.Api.Suppliers;

namespace PriceHunt.Tests.Suppliers;

// Task.Delay with a TimeProvider completes inside FakeTimeProvider.Advance, and these tests run without a
// SynchronizationContext, so the supplier's continuation has run by the time Advance returns.
public class SimulatedSupplierTests
{
    private const double LowestRandom = 0.0;
    private const double HighestRandom = 0.9999999999999999; // the largest double below 1

    private static readonly SearchCriteria Criteria =
        new("Berlin", "Paris", new DateOnly(2026, 12, 1), new DateOnly(2026, 12, 5));

    private readonly FakeTimeProvider _time = new();

    private SimulatedSupplier Create(SupplierBehavior behavior, params double[] randomValues) =>
        new("test", "Test", behavior, _time, new SequenceRandomSource(randomValues));

    [Fact]
    public async Task S2_NormalSupplier_WithLowestRandom_AnswersAfterHalfASecondWithMinimumPrice()
    {
        var quote = Create(SupplierBehavior.Normal, LowestRandom)
            .GetQuoteAsync(Criteria, TestContext.Current.CancellationToken);

        _time.Advance(TimeSpan.FromMilliseconds(499));
        Assert.False(quote.IsCompleted);

        _time.Advance(TimeSpan.FromMilliseconds(1));
        Assert.True(quote.IsCompleted);
        Assert.Equal(50.00m, (await quote).PriceUsd);
    }

    [Fact]
    public async Task S2_NormalSupplier_WithHighestRandom_AnswersWithinFiveSecondsWithPriceAtMostMaximum()
    {
        var quote = Create(SupplierBehavior.Normal, HighestRandom)
            .GetQuoteAsync(Criteria, TestContext.Current.CancellationToken);

        _time.Advance(TimeSpan.FromMilliseconds(4990));
        Assert.False(quote.IsCompleted);

        _time.Advance(TimeSpan.FromMilliseconds(10));
        Assert.True(quote.IsCompleted);
        var price = (await quote).PriceUsd;
        Assert.InRange(price, 499.99m, 500.00m);
        Assert.Equal(price, decimal.Round(price, 2));
    }

    [Theory]
    [InlineData(0.29, true)]
    [InlineData(0.30, false)]
    public async Task S3_FlakySupplier_FailsOnlyWhenRollIsBelowThreshold(double roll, bool fails)
    {
        // Draw order: delay, failure roll, price.
        var quote = Create(SupplierBehavior.Flaky, LowestRandom, roll, LowestRandom)
            .GetQuoteAsync(Criteria, TestContext.Current.CancellationToken);

        _time.Advance(TimeSpan.FromMilliseconds(500));

        if (fails)
            await Assert.ThrowsAsync<SupplierUnavailableException>(() => quote);
        else
            Assert.Equal(50.00m, (await quote).PriceUsd);
    }

    [Fact]
    public async Task S4_HangingSupplier_EndsOnlyThroughCancellation()
    {
        using var cts = new CancellationTokenSource();
        var quote = Create(SupplierBehavior.Hanging).GetQuoteAsync(Criteria, cts.Token);

        _time.Advance(TimeSpan.FromHours(1));
        Assert.False(quote.IsCompleted);

        cts.Cancel();
        Assert.True(quote.IsCanceled);
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => quote);
    }
}
