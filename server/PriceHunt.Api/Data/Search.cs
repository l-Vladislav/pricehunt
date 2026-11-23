using PriceHunt.Api.Search;

namespace PriceHunt.Api.Data;

public class Search
{
    public Guid Id { get; set; }
    public required string FromLocation { get; set; }
    public required string ToLocation { get; set; }
    public DateOnly FromDate { get; set; }
    public DateOnly ToDate { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public SearchStatus Status { get; set; }
}
