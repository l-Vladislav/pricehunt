using PriceHunt.Api.Suppliers;

namespace PriceHunt.Api.Search;

public abstract record SearchEvent(Guid SearchId);

public record SearchStarted(Guid SearchId, IReadOnlyList<SupplierInfo> Suppliers) : SearchEvent(SearchId);

public record QuoteReceived(Guid SearchId, string SupplierId, decimal Price, long ResponseTimeMs) : SearchEvent(SearchId);

public record SupplierFailed(Guid SearchId, string SupplierId, long ResponseTimeMs) : SearchEvent(SearchId);

public record SearchEnded(Guid SearchId, SearchStatus Status, int Responded, int Total) : SearchEvent(SearchId);
