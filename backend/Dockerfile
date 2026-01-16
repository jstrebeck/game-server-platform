# ============================================================
# Build Stage
# ============================================================
FROM python:3.12-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache gcc musl-dev python3-dev libffi-dev openssl-dev

# Copy dependencies
COPY requirements.txt .

# Install into a separate directory to keep final image small
RUN pip install --prefix=/install -r requirements.txt


# ============================================================
# Runtime Stage
# ============================================================
FROM python:3.12-alpine

WORKDIR /app

# Runtime dependencies (no heavy build tools)
RUN apk add --no-cache libffi openssl

# Copy installed python packages
COPY --from=builder /install /usr/local

# Copy application code
COPY . .

# Expose API port
EXPOSE 8000

# Run FastAPI app with Uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
