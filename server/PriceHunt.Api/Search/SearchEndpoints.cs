using System.Net.ServerSentEvents;

namespace PriceHunt.Api.Search;

public static class SearchEndpoints
{
    public static IEndpointRouteBuilder MapSearchEndpoints(this IEndpointRouteBuilder app)
    {
        // The token is the request's RequestAborted: a client that disconnects cancels the search (SS5).
        app.MapPost("/api/search", (SearchRequest request, SearchOrchestrator orchestrator, CancellationToken ct) =>
            TypedResults.ServerSentEvents(orchestrator.RunAsync(request, ct).Select(ToSseItem)));
        return app;
    }

    // SseItem<object>, not SseItem<SearchEvent>: the serializer then writes the runtime type with its own fields.
    private static SseItem<object> ToSseItem(SearchEvent e) => new(e, e switch
    {
        SearchStarted => "started",
        QuoteReceived => "quote",
        SupplierFailed => "supplier-failed",
        SearchEnded => "ended",
        _ => throw new ArgumentOutOfRangeException(nameof(e), e, "Unknown search event."),
    });
}
