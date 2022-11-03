#!/bin/bash

./copy_fe.sh
docker build -t scrumpoker . 
docker save -o ../scrumpoker.tar scrumpoker
scp ../scrumpoker.tar ubuntu@processor:~/
