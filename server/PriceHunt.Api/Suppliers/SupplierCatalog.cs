namespace PriceHunt.Api.Suppliers;

public static class SupplierCatalog
{
    public static IReadOnlyList<SupplierInfo> All { get; } =
    [
        new("pelican", "Pelican Parcel"),
        new("comet", "Comet Cargo"),
        new("maple", "Maple Freight"),
        new("harbor", "Harbor Hop"),
        new("nimbus", "Nimbus Shipping"),
        new("granite", "Granite Logistics"),
        new("lantern", "Lantern Express"),
    ];
}
