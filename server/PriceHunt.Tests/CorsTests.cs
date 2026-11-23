namespace PriceHunt.Tests;

public class CorsTests
{
    [Fact]
    public async Task Preflight_FromClientOrigin_AllowsJsonPost()
    {
        await using var factory = new PriceHuntApiFactory();
        using var client = factory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Options, "/api/search");
        request.Headers.Add("Origin", "http://localhost:4200");
        request.Headers.Add("Access-Control-Request-Method", "POST");
        request.Headers.Add("Access-Control-Request-Headers", "content-type");

        using var response = await client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.True(response.IsSuccessStatusCode, $"Status {response.StatusCode}");
        Assert.Equal("http://localhost:4200", Assert.Single(response.Headers.GetValues("Access-Control-Allow-Origin")));
        Assert.Contains("content-type", HeaderValues(response, "Access-Control-Allow-Headers"), StringComparer.OrdinalIgnoreCase);
        Assert.Contains("POST", HeaderValues(response, "Access-Control-Allow-Methods"));
    }

    private static IEnumerable<string> HeaderValues(HttpResponseMessage response, string name) =>
        response.Headers.TryGetValues(name, out var values)
            ? values.SelectMany(v => v.Split(',', StringSplitOptions.TrimEntries))
            : [];
}
