namespace PriceHunt.Api.Suppliers;

public static class SupplierServices
{
    public static IServiceCollection AddSuppliers(this IServiceCollection services)
    {
        services.AddSingleton<IRandomSource, SharedRandomSource>();

        foreach (var (supplier, behavior) in SupplierCatalog.Entries)
        {
            services.AddSingleton<ISupplier>(sp => new SimulatedSupplier(
                supplier.Id, supplier.Name, behavior,
                sp.GetRequiredService<TimeProvider>(), sp.GetRequiredService<IRandomSource>()));
        }

        return services;
    }
}
