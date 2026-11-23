namespace PriceHunt.Api.Suppliers;

public static class SupplierEndpoints
{
    public static IEndpointRouteBuilder MapSupplierEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/suppliers", () => SupplierCatalog.All);
        return app;
    }
}
