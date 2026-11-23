using Microsoft.Extensions.Time.Testing;
using PriceHunt.Api.Suppliers;

namespace PriceHunt.Tests.Suppliers;

public class SimulatedSupplierTests
{
    private const double LowestRandom = 0.0;
    private const double HighestRandom = 0.9999999999999999; // the largest double below 1

    private static readonly SearchCriteria Criteria =
        new("Berlin", "Paris", new DateOnly(2026, 12, 1), new DateOnly(2026, 12, 5));

    private readonly FakeTimeProvider _time = new();

    private SimulatedSupplier Create(SupplierBehavior behavior, params double[] randomValues) =>
        new("test", "Test", behavior, _time, new SequenceRandomSource(randomValues));

    // Starts a call, advances the clock, then cancels the call. Returns the quote if the call's delay was over by then,
    // or null if it was still waiting. Advance completes the delay synchronously, but the supplier's continuation
    // may run later, so a check of IsCompleted right after Advance would race.
    private async Task<SupplierQuote?> QuoteAfter(SimulatedSupplier supplier, TimeSpan elapsed)
    {
        using var cts = new CancellationTokenSource();
        var quote = supplier.GetQuoteAsync(Criteria, cts.Token);
        _time.Advance(elapsed);
        cts.Cancel();
        try
        {
            return await quote;
        }
        catch (OperationCanceledException)
        {
            return null;
        }
    }

    [Fact]
    public async Task S2_NormalSupplier_WithLowestRandom_AnswersAfterHalfASecondWithMinimumPrice()
    {
        var supplier = Create(SupplierBehavior.Normal, LowestRandom);

        Assert.Null(await QuoteAfter(supplier, TimeSpan.FromMilliseconds(499)));
        Assert.Equal(50.00m, (await QuoteAfter(supplier, TimeSpan.FromMilliseconds(500)))?.PriceUsd);
    }

    [Fact]
    public async Task S2_NormalSupplier_WithHighestRandom_AnswersWithinFiveSecondsWithPriceAtMostMaximum()
    {
        var supplier = Create(SupplierBehavior.Normal, HighestRandom);

        Assert.Null(await QuoteAfter(supplier, TimeSpan.FromMilliseconds(4990)));
        var quote = await QuoteAfter(supplier, TimeSpan.FromSeconds(5));
        Assert.NotNull(quote);
        Assert.InRange(quote.PriceUsd, 499.99m, 500.00m);
        Assert.Equal(quote.PriceUsd, decimal.Round(quote.PriceUsd, 2));
    }

    [Fact]
    public async Task S2_NormalSupplier_RoundsPriceToCents()
    {
        var supplier = Create(SupplierBehavior.Normal, 0.123456789); // price 105.555555...

        Assert.Equal(105.56m, (await QuoteAfter(supplier, TimeSpan.FromSeconds(5)))?.PriceUsd);
    }

    [Theory]
    [InlineData(0.29, true)]
    [InlineData(0.30, false)]
    public async Task S3_FlakySupplier_FailsOnlyWhenRollIsBelowThreshold(double roll, bool fails)
    {
        // Draw order: delay, failure roll, price.
        var supplier = Create(SupplierBehavior.Flaky, LowestRandom, roll, LowestRandom);

        if (fails)
            await Assert.ThrowsAsync<SupplierUnavailableException>(() => QuoteAfter(supplier, TimeSpan.FromMilliseconds(500)));
        else
            Assert.Equal(50.00m, (await QuoteAfter(supplier, TimeSpan.FromMilliseconds(500)))?.PriceUsd);
    }

    [Fact]
    public async Task S3_FlakySupplier_DrawsThePriceAlsoWhenItFails()
    {
        // First call: delay, roll (fails), price. Second call: delay, roll (passes), price.
        var supplier = Create(SupplierBehavior.Flaky, LowestRandom, 0.1, 0.9, LowestRandom, 0.5, LowestRandom);

        await Assert.ThrowsAsync<SupplierUnavailableException>(() => QuoteAfter(supplier, TimeSpan.FromMilliseconds(500)));
        Assert.Equal(50.00m, (await QuoteAfter(supplier, TimeSpan.FromMilliseconds(500)))?.PriceUsd);
    }

    [Fact]
    public async Task S4_HangingSupplier_EndsOnlyThroughCancellation()
    {
        // No random values: a draw would throw, so this also checks that the hanging supplier draws nothing.
        var supplier = Create(SupplierBehavior.Hanging);

        Assert.Null(await QuoteAfter(supplier, TimeSpan.FromHours(1)));
    }
}
