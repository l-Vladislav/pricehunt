using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using PriceHunt.Api.Search;

namespace PriceHunt.Api.Data;

public static class DataServices
{
    public static IServiceCollection AddDatabase(this IServiceCollection services)
    {
        // Read when the first context is created, not before Build(): only then does the test factory's setting apply.
        services.AddDbContextFactory<AppDbContext>((sp, options) =>
        {
            var connectionString = sp.GetRequiredService<IConfiguration>().GetConnectionString("Default")
                ?? new SqliteConnectionStringBuilder
                {
                    DataSource = Path.Combine(sp.GetRequiredService<IHostEnvironment>().ContentRootPath, "pricehunt.db"),
                }.ToString();
            options.UseSqlite(connectionString);
        });
        services.AddSingleton<ISearchRecorder, EfSearchRecorder>();
        return services;
    }

    public static void MigrateDatabase(this WebApplication app)
    {
        using var db = app.Services.GetRequiredService<IDbContextFactory<AppDbContext>>().CreateDbContext();
        db.Database.Migrate();
    }
}
