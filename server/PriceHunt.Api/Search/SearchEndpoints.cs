using System.Net.ServerSentEvents;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using PriceHunt.Api.Data;
using PriceHunt.Api.Suppliers;

namespace PriceHunt.Api.Search;

public static class SearchEndpoints
{
    public static IEndpointRouteBuilder MapSearchEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/search", SearchAsync);
        return app;
    }

    // The built-in validation has already checked the request. These checks need the catalog or the DB.
    // Their 400s have the same shape as the built-in ones, keyed by the property name.
    // ct is RequestAborted: a client that disconnects cancels the search (SS5).
    private static async Task<Results<ServerSentEventsResult<SearchEvent>, ValidationProblem>> SearchAsync(
        SearchRequest request, SearchOrchestrator orchestrator, IDbContextFactory<AppDbContext> dbFactory, CancellationToken ct)
    {
        var unknown = (request.SupplierIds ?? []).Except(SupplierCatalog.All.Select(s => s.Id)).ToList();
        if (unknown.Count > 0)
            return Problem(nameof(request.SupplierIds), $"Unknown supplier ids: {string.Join(", ", unknown)}.");

        await using (var db = await dbFactory.CreateDbContextAsync(ct))
        {
            if (await db.Searches.AnyAsync(s => s.Id == request.SearchId, ct))
                return Problem(nameof(request.SearchId), "A search with this id already exists.");
        }

        // Trimmed before the search is recorded, so the history filter matches (I6).
        var trimmed = request with { FromLocation = request.FromLocation.Trim(), ToLocation = request.ToLocation.Trim() };
        return TypedResults.ServerSentEvents(orchestrator.RunAsync(trimmed, ct).Select(ToSseItem));
    }

    private static ValidationProblem Problem(string field, string message) =>
        TypedResults.ValidationProblem(new Dictionary<string, string[]> { [field] = [message] });

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
