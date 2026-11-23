using Microsoft.EntityFrameworkCore;
using PriceHunt.Api.Data;

namespace PriceHunt.Api.History;

public static class HistoryEndpoints
{
    public static IEndpointRouteBuilder MapHistoryEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/history", GetHistoryAsync);
        return app;
    }

    private static async Task<HistoryPage> GetHistoryAsync(
        [AsParameters] HistoryQuery query, IDbContextFactory<AppDbContext> dbFactory, CancellationToken ct)
    {
        await using var db = await dbFactory.CreateDbContextAsync(ct);

        var rows =
            from r in db.SupplierResponses
            join s in db.Searches on r.SearchId equals s.Id
            join sup in db.Suppliers on r.SupplierId equals sup.Id
            select new { Response = r, Search = s, SupplierName = sup.Name };

        // Compared as UTC, so the result doesn't depend on the server's time zone (I4).
        if (query.StartDate is { } start)
            rows = rows.Where(x => x.Search.CreatedAtUtc >= start.UtcDateTime);
        if (query.EndDate is { } end)
            rows = rows.Where(x => x.Search.CreatedAtUtc < end.UtcDateTime);
        if (query.SupplierIds is { Length: > 0 } supplierIds)
            rows = rows.Where(x => supplierIds.Contains(x.Response.SupplierId));

        // NOCASE folds both sides by one rule, ASCII only. ToLower() would fold the input by .NET's rules and the column
        // by SQLite's, so a location like "Österreich" would not match itself (I6).
        if (query.FromLocation?.Trim() is { Length: > 0 } from)
            rows = rows.Where(x => EF.Functions.Collate(x.Search.FromLocation, "NOCASE") == from);
        if (query.ToLocation?.Trim() is { Length: > 0 } to)
            rows = rows.Where(x => EF.Functions.Collate(x.Search.ToLocation, "NOCASE") == to);

        var desc = query.SortDir == "desc";
        var sorted = query.SortBy switch
        {
            "route" => desc
                ? rows.OrderByDescending(x => x.Search.FromLocation).ThenByDescending(x => x.Search.ToLocation)
                : rows.OrderBy(x => x.Search.FromLocation).ThenBy(x => x.Search.ToLocation),
            "supplier" => desc ? rows.OrderByDescending(x => x.SupplierName) : rows.OrderBy(x => x.SupplierName),
            // Failed rows (null price) go last in both directions (I5).
            "price" => desc
                ? rows.OrderBy(x => x.Response.PriceMinor == null).ThenByDescending(x => x.Response.PriceMinor)
                : rows.OrderBy(x => x.Response.PriceMinor == null).ThenBy(x => x.Response.PriceMinor),
            "responseTime" => desc ? rows.OrderByDescending(x => x.Response.ResponseTimeMs) : rows.OrderBy(x => x.Response.ResponseTimeMs),
            _ => desc ? rows.OrderByDescending(x => x.Search.CreatedAtUtc) : rows.OrderBy(x => x.Search.CreatedAtUtc),
        };

        var total = await rows.CountAsync(ct);
        var items = await sorted
            .ThenBy(x => x.Response.Id)
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .Select(x => new HistoryItem(
                x.Response.Id,
                x.Search.CreatedAtUtc,
                x.Search.FromLocation,
                x.Search.ToLocation,
                x.SupplierName,
                x.Response.PriceMinor / 100m,
                x.Response.ResponseTimeMs))
            .ToListAsync(ct);

        return new HistoryPage(items, total, query.Page, query.PageSize);
    }
}
