namespace Ranker.Domain.Entities;

/// <summary>Aggregate visit counter for one calendar date (UTC); one row per day, no per-visit rows.</summary>
public class DailyVisitCount
{
    public int Id { get; set; }

    public DateOnly VisitDate { get; set; }

    public int Count { get; set; }
}
