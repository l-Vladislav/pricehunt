using System.Net;
using System.Text.Json;

namespace PriceHunt.Tests.Suppliers;

public class SupplierEndpointsTests
{
    [Fact]
    public async Task S1_GetSuppliers_ReturnsSevenSuppliersWithIdAndName()
    {
        await using var factory = new PriceHuntApiFactory();
        using var client = factory.CreateClient();

        using var response = await client.GetAsync("/api/suppliers", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        var suppliers = json.RootElement.EnumerateArray().ToList();
        Assert.Equal(7, suppliers.Count);
        Assert.All(suppliers, s =>
        {
            Assert.False(string.IsNullOrWhiteSpace(s.GetProperty("id").GetString()));
            Assert.False(string.IsNullOrWhiteSpace(s.GetProperty("name").GetString()));
        });
        Assert.Equal(7, suppliers.Select(s => s.GetProperty("id").GetString()).Distinct().Count());
    }
}
