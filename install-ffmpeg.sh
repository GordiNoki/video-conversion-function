wget https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz -O ffmpeg.tar.xz
filePath=`tar -xvJf ffmpeg.tar.xz --wildcards **/ffmpeg`
cp $filePath .
rm -rf ffmpeg-*
rm ffmpeg.tar.xz