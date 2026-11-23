using System.Net.ServerSentEvents;

namespace PriceHunt.Api.Search;

public static class SearchEndpoints
{
    public static IEndpointRouteBuilder MapSearchEndpoints(this IEndpointRouteBuilder app)
    {
        // ct is RequestAborted, so a client that disconnects cancels the search (SS5). The SSE result also passes
        // RequestAborted to the enumerator; passing it here doesn't depend on that.
        app.MapPost("/api/search", (SearchRequest request, SearchOrchestrator orchestrator, CancellationToken ct) =>
            TypedResults.ServerSentEvents(orchestrator.RunAsync(request, ct).Select(ToSseItem)));
        return app;
    }

    // ASP.NET Core serializes each item by its runtime type, so the derived events' fields are written.
    private static SseItem<SearchEvent> ToSseItem(SearchEvent e) => new(e, e switch
    {
        SearchStarted => "started",
        QuoteReceived => "quote",
        SupplierFailed => "supplier-failed",
        SearchEnded => "ended",
        _ => throw new ArgumentOutOfRangeException(nameof(e), e, "Unknown search event."),
    });
}
