using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using PriceHunt.Api.Search;
using PriceHunt.Api.Suppliers;

namespace PriceHunt.Api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Supplier> Suppliers => Set<Supplier>();
    public DbSet<SearchRecord> Searches => Set<SearchRecord>();
    public DbSet<SearchSupplier> SearchSuppliers => Set<SearchSupplier>();
    public DbSet<SupplierResponse> SupplierResponses => Set<SupplierResponse>();

    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        configurationBuilder.Properties<SearchStatus>().HaveConversion<string>();
        configurationBuilder.Properties<DateTime>().HaveConversion<UtcDateTimeConverter>();
    }

    // SQLite gives back DateTime with Kind = Unspecified. Every stored time is UTC, so mark it as such on read
    // and the JSON gets a "Z". SpecifyKind, not ToUniversalTime(): that one would treat the value as local time.
    private sealed class UtcDateTimeConverter() : ValueConverter<DateTime, DateTime>(
        v => v, v => DateTime.SpecifyKind(v, DateTimeKind.Utc));

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Supplier>()
            .HasData(SupplierCatalog.All.Select(s => new Supplier { Id = s.Id, Name = s.Name }));

        modelBuilder.Entity<SearchRecord>().HasIndex(s => s.CreatedAtUtc);

        modelBuilder.Entity<SearchSupplier>(e =>
        {
            e.HasKey(ss => new { ss.SearchId, ss.SupplierId });
            e.HasOne<SearchRecord>().WithMany().HasForeignKey(ss => ss.SearchId);
            e.HasOne<Supplier>().WithMany().HasForeignKey(ss => ss.SupplierId);
        });

        modelBuilder.Entity<SupplierResponse>(e =>
        {
            e.HasOne<SearchRecord>().WithMany().HasForeignKey(r => r.SearchId);
            e.HasOne<Supplier>().WithMany().HasForeignKey(r => r.SupplierId);
        });
    }
}
