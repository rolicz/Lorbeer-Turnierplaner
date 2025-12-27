FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY run.py manage.py ./

RUN mkdir -p /data
ENV DB_URL=sqlite:////data/app.db

EXPOSE 8001
CMD ["python", "run.py", "--host", "0.0.0.0", "--port", "8001", "--secrets", "/app/secrets.json"]
