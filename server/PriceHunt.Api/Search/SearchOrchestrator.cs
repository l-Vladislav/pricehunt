using System.Runtime.CompilerServices;
using PriceHunt.Api.Suppliers;

namespace PriceHunt.Api.Search;

public sealed class SearchOrchestrator(IEnumerable<ISupplier> suppliers, ISearchRecorder recorder, TimeProvider timeProvider)
{
    public IAsyncEnumerable<SearchEvent> RunAsync(SearchRequest request, CancellationToken ct = default) =>
        throw new NotImplementedException();
}
