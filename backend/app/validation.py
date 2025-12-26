def validate_star_rating(value: float) -> float:
    v = float(value)
    if v < 0.5 or v > 5.0:
        raise ValueError("star_rating must be between 0.5 and 5.0")
    if (v * 2) % 1 != 0:
        raise ValueError("star_rating must be in 0.5 steps")
    return v