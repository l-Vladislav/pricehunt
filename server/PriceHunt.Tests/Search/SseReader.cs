using System.Net.ServerSentEvents;
using System.Text.Json;

namespace PriceHunt.Tests.Search;

public record SseEvent(string Type, JsonElement Data);

public sealed class SseReader(HttpResponseMessage response, Stream stream, CancellationToken ct) : IAsyncDisposable
{
    private readonly IAsyncEnumerator<SseItem<string>> _items = SseParser.Create(stream).EnumerateAsync(ct).GetAsyncEnumerator();

    public async Task<SseEvent> NextAsync()
    {
        Assert.True(await _items.MoveNextAsync(), "The stream closed before the next event.");
        return new SseEvent(_items.Current.EventType, JsonElement.Parse(_items.Current.Data));
    }

    public async Task<SseEvent> NextAsync(string type)
    {
        var next = await NextAsync();
        Assert.Equal(type, next.Type);
        return next;
    }

    public async Task AssertClosedAsync() => Assert.False(await _items.MoveNextAsync(), "Expected the stream to close.");

    public async ValueTask DisposeAsync()
    {
        await _items.DisposeAsync();
        await stream.DisposeAsync();
        response.Dispose();
    }
}
