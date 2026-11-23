using PriceHunt.Api.Suppliers;

namespace PriceHunt.Tests;

/// <summary>Returns the given values in order and starts over when it runs out.</summary>
public sealed class SequenceRandomSource(params double[] values) : IRandomSource
{
    private int _next;

    public double NextDouble() => values[_next++ % values.Length];
}
