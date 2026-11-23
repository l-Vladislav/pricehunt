using Microsoft.EntityFrameworkCore;
using PriceHunt.Api.Search;
using PriceHunt.Api.Suppliers;

namespace PriceHunt.Api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Supplier> Suppliers => Set<Supplier>();
    public DbSet<Search> Searches => Set<Search>();
    public DbSet<SearchSupplier> SearchSuppliers => Set<SearchSupplier>();
    public DbSet<SupplierResponse> SupplierResponses => Set<SupplierResponse>();

    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        configurationBuilder.Properties<SearchStatus>().HaveConversion<string>();
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Supplier>()
            .HasData(SupplierCatalog.All.Select(s => new Supplier { Id = s.Id, Name = s.Name }));

        modelBuilder.Entity<Search>().HasIndex(s => s.CreatedAtUtc);

        modelBuilder.Entity<SearchSupplier>(e =>
        {
            e.HasKey(ss => new { ss.SearchId, ss.SupplierId });
            e.HasOne<Search>().WithMany().HasForeignKey(ss => ss.SearchId);
            e.HasOne<Supplier>().WithMany().HasForeignKey(ss => ss.SupplierId);
        });

        modelBuilder.Entity<SupplierResponse>(e =>
        {
            e.HasOne<Search>().WithMany().HasForeignKey(r => r.SearchId);
            e.HasOne<Supplier>().WithMany().HasForeignKey(r => r.SupplierId);
        });
    }
}
