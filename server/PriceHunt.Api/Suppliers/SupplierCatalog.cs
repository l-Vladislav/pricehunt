namespace PriceHunt.Api.Suppliers;

public static class SupplierCatalog
{
    public static IReadOnlyList<(SupplierInfo Supplier, SupplierBehavior Behavior)> Entries { get; } =
    [
        (new("pelican", "Pelican Parcel"), SupplierBehavior.Normal),
        (new("comet", "Comet Cargo"), SupplierBehavior.Normal),
        (new("maple", "Maple Freight"), SupplierBehavior.Normal),
        (new("harbor", "Harbor Hop"), SupplierBehavior.Normal),
        (new("nimbus", "Nimbus Shipping"), SupplierBehavior.Normal),
        (new("granite", "Granite Logistics"), SupplierBehavior.Flaky),
        (new("lantern", "Lantern Express"), SupplierBehavior.Hanging),
    ];

    public static IReadOnlyList<SupplierInfo> All { get; } = [.. Entries.Select(e => e.Supplier)];
}
