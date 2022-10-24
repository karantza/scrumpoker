FROM python:3.10 as base
ENV DEBIAN_FRONTEND=noninteractive

COPY ./requirements.txt /tmp/requirements.txt
RUN pip3 install -r /tmp/requirements.txt --timeout 60

# Add app
COPY . /app
WORKDIR /app

EXPOSE 9991

CMD [ "python", "app.py" ] 