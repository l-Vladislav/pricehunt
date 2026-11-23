namespace PriceHunt.Api.Suppliers;

public interface IRandomSource
{
    /// <summary>A value in [0, 1).</summary>
    double NextDouble();
}
