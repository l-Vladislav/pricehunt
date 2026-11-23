namespace PriceHunt.Api.Search;

/// <summary>One supplier's answer. A null <see cref="Price"/> means the supplier failed.</summary>
public record SupplierResult(string SupplierId, decimal? Price, long ResponseTimeMs, DateTime ReceivedAtUtc);
