namespace PriceHunt.Tests.Search;

/// <summary>One ordered log for the fake recorder and the fake suppliers, so tests can check what happened before what.</summary>
public sealed class CallLog
{
    private readonly List<string> _entries = [];

    public IReadOnlyList<string> Entries
    {
        get { lock (_entries) return [.. _entries]; }
    }

    public void Add(string entry)
    {
        lock (_entries) _entries.Add(entry);
    }
}
