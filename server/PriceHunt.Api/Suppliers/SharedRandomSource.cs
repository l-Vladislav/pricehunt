namespace PriceHunt.Api.Suppliers;

public sealed class SharedRandomSource : IRandomSource
{
    public double NextDouble() => Random.Shared.NextDouble();
}
