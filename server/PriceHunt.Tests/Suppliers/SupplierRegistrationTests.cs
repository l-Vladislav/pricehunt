using Microsoft.Extensions.DependencyInjection;
using PriceHunt.Api.Suppliers;

namespace PriceHunt.Tests.Suppliers;

public class SupplierRegistrationTests
{
    [Fact]
    public async Task S1_RegisteredSuppliers_AreSevenSimulatedSuppliersInCatalogOrder()
    {
        await using var factory = new PriceHuntApiFactory();

        var suppliers = factory.Services.GetServices<ISupplier>().Cast<SimulatedSupplier>().ToList();

        Assert.Equal(SupplierCatalog.All.Select(s => (s.Id, s.Name)), suppliers.Select(s => (s.Id, s.Name)));
        SupplierBehavior[] expected =
        [
            SupplierBehavior.Normal, SupplierBehavior.Normal, SupplierBehavior.Normal, SupplierBehavior.Normal,
            SupplierBehavior.Normal, SupplierBehavior.Flaky, SupplierBehavior.Hanging,
        ];
        Assert.Equal(expected, suppliers.Select(s => s.Behavior));
    }
}
