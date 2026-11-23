using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Time.Testing;
using PriceHunt.Api.Data;
using PriceHunt.Api.Search;
using PriceHunt.Api.Suppliers;

namespace PriceHunt.Tests;

public sealed class PriceHuntApiFactory : WebApplicationFactory<Program>
{
    private readonly string _connectionString = $"Data Source=test-{Guid.NewGuid()};Mode=Memory;Cache=Shared";

    // A shared-cache in-memory database lives only while a connection to it is open.
    private readonly SqliteConnection _keepAlive;

    public PriceHuntApiFactory()
    {
        _keepAlive = new SqliteConnection(_connectionString);
        _keepAlive.Open();
    }

    public FakeTimeProvider Time { get; } = new();

    /// <summary>Completes when the search's final status is in the DB. For tests that run one search.</summary>
    public Task SearchFinished => ((FinishSignalingRecorder)Services.GetRequiredService<ISearchRecorder>()).Finished;

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseSetting("ConnectionStrings:Default", _connectionString);
        builder.ConfigureTestServices(services =>
        {
            services.Replace(ServiceDescriptor.Singleton<TimeProvider>(Time));
            services.Replace(ServiceDescriptor.Singleton<IRandomSource>(DefaultRandom()));
            services.Replace(ServiceDescriptor.Singleton<ISearchRecorder>(sp =>
                new FinishSignalingRecorder(ActivatorUtilities.CreateInstance<EfSearchRecorder>(sp))));
        });
    }

    // Suppliers draw in catalog order, 13 values per search: delay = 0.5 s + 4.5 s × r, price = 50 + 450 × r.
    // The six answering suppliers get distinct delays and prices, and the flaky one fails. Lantern hangs and draws nothing.
    private static SequenceRandomSource DefaultRandom() => new(
        0.5, 0.5, //       pelican: 2.75 s, 275.00
        0.25, 0.25, //     comet: 1.625 s, 162.50
        0.75, 0.75, //     maple: 3.875 s, 387.50
        0.125, 0.875, //   harbor: 1.0625 s, 443.75
        0.625, 0.125, //   nimbus: 3.3125 s, 106.25
        0.375, 0, 0.5); // granite: fails after 2.1875 s (0 < 0.3), its price is drawn but unused

    public override async ValueTask DisposeAsync()
    {
        await base.DisposeAsync();
        await _keepAlive.DisposeAsync();
    }
}
